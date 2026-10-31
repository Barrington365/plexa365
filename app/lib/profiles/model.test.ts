import {describe,it,expect} from 'vitest';import {profileEdit,defaultVoice} from './model';
describe('profile boundaries',()=>{
 const profile={id:'presenter:daniel-brooks',bio:'Fictional presenter',voiceId:'sam',voiceUseApproved:true,assets:[],expectedRevision:0};
 it('accepts media profile edits',()=>expect(profileEdit.safeParse(profile).success).toBe(true));
 it('does not accept login or execution permission grants',()=>{expect(profileEdit.safeParse({...profile,role:'admin'}).success).toBe(false);expect(profileEdit.safeParse({...profile,active:true}).success).toBe(false);});
 it('uses the existing Studio Sam ahead of a namesake',()=>expect(defaultVoice([{id:'studio',name:'Planet F1 - Male - Sam'},{id:'premade',name:'Sam'}])).toBe('studio'));
 it('does not substitute a namesake',()=>expect(defaultVoice([{id:'premade',name:'Sam'}])).toBe(''));
 it('does not guess ambiguous voice assignments',()=>expect(defaultVoice([{id:'one',name:'Sam'},{id:'two',name:'Sam'}])).toBe(''));
});
