#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
use std::{sync::Mutex,time::{Duration,Instant}};
use base64::{Engine as _,engine::general_purpose::URL_SAFE_NO_PAD};
use rand::RngCore;
use sha2::{Sha256,Digest};
use tauri::{Manager,Emitter,menu::{Menu,MenuItem},tray::TrayIconBuilder};
use tauri_plugin_deep_link::DeepLinkExt;
use tauri_plugin_opener::OpenerExt;
use serde_json::{json,Value};
struct Pending{state:String,verifier:String,created:Instant}
#[derive(Default)]struct Login(Mutex<Option<Pending>>);
fn random()->String{let mut bytes=[0u8;32];rand::thread_rng().fill_bytes(&mut bytes);URL_SAFE_NO_PAD.encode(bytes)}
fn origin()->String{
 #[cfg(debug_assertions)]
 if let Some(value)=option_env!("PLEXA_DESKTOP_DEV_ORIGIN") {if let Ok(u)=url::Url::parse(value){if u.scheme()=="http"&&matches!(u.host_str(),Some("127.0.0.1"|"localhost")){return u.origin().ascii_serialization();}}}
 "https://planetsport.studio".into()
}
fn credential()->Result<keyring::Entry,String>{keyring::Entry::new("studio.planetsport.companion",&origin()).map_err(|_|"Keychain unavailable".into())}
// Isolated loopback QA sessions never touch a user's Keychain. Release builds cannot enable this.
static TEST_TOKEN: Mutex<Option<String>> = Mutex::new(None);
fn temporary_session()->bool { cfg!(debug_assertions) && origin().starts_with("http://") }
fn session_read()->Result<String,String>{
 if temporary_session(){return TEST_TOKEN.lock().map_err(|_|"Session unavailable")?.clone().ok_or("Please sign in to the local test account".into());}
 credential()?.get_password().map_err(|_|"Keychain access was not granted. Please retry sign-in.".into())
}
fn session_save(token:&str)->Result<(),String>{
 if temporary_session(){*TEST_TOKEN.lock().map_err(|_|"Session unavailable")?=Some(token.into());return Ok(());}
 credential()?.set_password(token).map_err(|_|"Could not save session to Keychain".into())
}
fn session_clear()->Result<(),String>{
 if temporary_session(){*TEST_TOKEN.lock().map_err(|_|"Session unavailable")?=None;return Ok(());}
 match credential()?.delete_credential(){Ok(())|Err(keyring::Error::NoEntry)=>Ok(()),Err(_)=>Err("Could not remove Keychain session".into())}
}
fn client()->Result<reqwest::Client,String>{reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(90)).build().map_err(|_|"Network unavailable".into())}
#[tauri::command]
fn begin_login(app:tauri::AppHandle,state:tauri::State<Login>)->Result<(),String>{
 let verifier=random();let nonce=random();let challenge=URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()));
 *state.0.lock().map_err(|_|"Login unavailable")?=Some(Pending{state:nonce.clone(),verifier,created:Instant::now()});
 app.opener().open_url(format!("{}/desktop/connect?challenge={}&state={}",origin(),challenge,nonce),None::<&str>).map_err(|_|"Could not open system browser".into())
}
async fn complete_login(app:tauri::AppHandle,url:String)->Result<(),String>{
 let parsed=url::Url::parse(&url).map_err(|_|"Invalid callback")?;
 if parsed.scheme()!=if temporary_session(){"plexa-dev"}else{"plexa"}||parsed.host_str()!=Some("auth")||!parsed.path().is_empty()&&parsed.path()!="/"{return Err("Invalid callback".into());}
 let pairs:std::collections::HashMap<_,_>=parsed.query_pairs().into_owned().collect();
 let code=pairs.get("code").ok_or("Missing code")?;let nonce=pairs.get("state").ok_or("Missing state")?;
 let pending={let login=app.state::<Login>();let mut guard=login.0.lock().map_err(|_|"Login unavailable")?;
  if !guard.as_ref().is_some_and(|p|p.state==*nonce&&p.created.elapsed()<Duration::from_secs(300)){return Err("Expired sign-in. Start again.".into());}guard.take().ok_or("Missing sign-in")?};
 let response=client()?.post(format!("{}/api/desktop/exchange",origin())).json(&json!({"code":code,"verifier":pending.verifier})).send().await.map_err(|_|"Sign-in connection failed")?;
 if !response.status().is_success(){return Err("Sign-in expired or access denied".into());}
 let body:Value=response.json().await.map_err(|_|"Invalid sign-in response")?;
 let token=body["token"].as_str().filter(|t|t.len()==43).ok_or("Invalid credential")?;
 session_save(token)?;
 app.emit("desktop-auth",true).map_err(|_|"Could not notify window")?;
 if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}Ok(())
}
#[tauri::command]
async fn companion_request(body:Option<Value>)->Result<Value,String>{
 if let Some(ref b)=body{if !matches!(b["action"].as_str(),Some("talk"|"preferences")){return Err("Unsupported companion action".into());}}
 let token=session_read()?;
 let c=client()?;let url=format!("{}/api/desktop/companion",origin());
 let request=match body{Some(b)=>c.post(url).json(&b),None=>c.get(url)};
 let response=request.bearer_auth(token).send().await.map_err(|_|"Offline. Your draft is kept; reconnect before retrying.")?;
 let status=response.status().as_u16();let value:Value=response.json().await.map_err(|_|"Server unavailable. Try again later.")?;
 if status==401{let _=session_clear();}
 Ok(json!({"status":status,"body":value}))
}
#[tauri::command]
async fn logout()->Result<(),String>{
 if let Ok(token)=session_read(){let response=client()?.post(format!("{}/api/desktop/logout",origin())).bearer_auth(token).send().await;
  if !response.is_ok_and(|r|r.status().is_success()){return Err("Could not revoke session. Reconnect and try logout again.".into());}}
 session_clear()
}
#[tauri::command]
fn open_plexa(app:tauri::AppHandle,path:String)->Result<(),String>{
 let valid=path=="/admin/agents"||path=="/workspace/studio"||path.strip_prefix("/workspace/studio?project=").is_some_and(|id|!id.is_empty()&&id.len()<=150&&id.bytes().all(|b|b.is_ascii_alphanumeric()||b==b'-'||b==b'_'));
 if !valid{return Err("Unsupported destination".into());}
 app.opener().open_url(format!("{}{}",origin(),path),None::<&str>).map_err(|_|"Could not open Plexa".into())
}
fn main(){
 tauri::Builder::default().manage(Login::default())
 .plugin(tauri_plugin_opener::init()).plugin(tauri_plugin_deep_link::init())
 .plugin(tauri_plugin_notification::init())
 .plugin(tauri_plugin_autostart::Builder::new().build())
 .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(tauri_plugin_window_state::StateFlags::SIZE|tauri_plugin_window_state::StateFlags::POSITION).build())
 .invoke_handler(tauri::generate_handler![begin_login,companion_request,logout,open_plexa])
 .setup(|app|{
  let show=MenuItem::with_id(app,"show","Show Plexa Companion",true,None::<&str>)?;
  let hide=MenuItem::with_id(app,"hide","Hide companion",true,None::<&str>)?;
  let quit=MenuItem::with_id(app,"quit","Quit Plexa Companion",true,None::<&str>)?;
  let menu=Menu::with_items(app,&[&show,&hide,&quit])?;
  TrayIconBuilder::new().menu(&menu).tooltip("Plexa Companion").title("Plexa").on_menu_event(|app,event|{match event.id.as_ref(){"show"=>{if let Some(w)=app.get_webview_window("main"){let _=w.show();let _=w.set_focus();}},"hide"=>{if let Some(w)=app.get_webview_window("main"){let _=w.hide();}},"quit"=>app.exit(0),_=>()}}).build(app)?;
  let handle=app.handle().clone();app.deep_link().on_open_url(move|event|{for url in event.urls(){let handle=handle.clone();tauri::async_runtime::spawn(async move{if let Err(error)=complete_login(handle.clone(),url.to_string()).await{let _=handle.emit("desktop-auth-error",error);}});}});
  Ok(())
 }).on_window_event(|window,event|{if let tauri::WindowEvent::CloseRequested{api,..}=event{api.prevent_close();let _=window.hide();}})
 .run(tauri::generate_context!()).expect("Plexa Companion could not start");
}
