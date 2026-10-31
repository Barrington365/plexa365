import { beforeEach,describe,it,expect,vi } from "vitest";
vi.mock("@/app/lib/auth/guards",()=>({requireAdmin:vi.fn()}));
vi.mock("@/app/lib/agents/store",()=>({readAgents:vi.fn(),updateAgents:vi.fn(),Conflict:class extends Error{}}));
import {requireAdmin} from "@/app/lib/auth/guards";
import {readAgents,updateAgents} from "@/app/lib/agents/store";
import { GET,POST } from "./route";
describe("Admin agents API",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("blocks unauthenticated reads without reading storage",async()=>{vi.mocked(requireAdmin).mockResolvedValue({response:new Response(null,{status:401})});expect((await GET(new Request("https://plexa.test/api/admin/agents"))).status).toBe(401);expect(readAgents).not.toHaveBeenCalled();});
 it("blocks non-admin writes",async()=>{vi.mocked(requireAdmin).mockResolvedValue({response:new Response(null,{status:403})});expect((await POST(new Request("https://plexa.test/api/admin/agents",{method:"POST"}))).status).toBe(403);expect(updateAgents).not.toHaveBeenCalled();});
 it("rejects cross-origin writes even from an admin",async()=>{vi.mocked(requireAdmin).mockResolvedValue({user:{id:"admin"} as never});expect((await POST(new Request("https://plexa.test/api/admin/agents",{method:"POST",headers:{origin:"https://other.test"}}))).status).toBe(403);expect(updateAgents).not.toHaveBeenCalled();});
});
