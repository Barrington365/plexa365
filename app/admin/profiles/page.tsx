import {headers} from 'next/headers';import {redirect} from 'next/navigation';import {requireAdmin} from '@/app/lib/auth/guards';import {ProfileDirectory} from './ProfileDirectory';
export default async function Page(){const auth=await requireAdmin(new Request('https://studio.internal/admin/profiles',{headers:await headers()}));if('response'in auth)redirect('/login');return <ProfileDirectory/>;}
