import { PlexaGatewayPopout } from "@/app/components/PlexaGatewayPopout";
import { roles } from "@/app/lib/agents/model";
import { BRAND_SUITE } from "@/app/lib/brand";

export const metadata = {
  title: `Plexa Agent · ${BRAND_SUITE}`,
};

export default async function DevGatewayPopoutPage({searchParams}:{searchParams:Promise<{agent?:string}>}) {
  const {agent}=await searchParams;
  const agentId=roles.some(r=>r[0]===agent)?agent!:"manager";
  return (
    <main className="min-h-screen bg-[color:var(--bg)] p-2">
      <PlexaGatewayPopout embedded defaultOpen initialAgentId={agentId} />
    </main>
  );
}
