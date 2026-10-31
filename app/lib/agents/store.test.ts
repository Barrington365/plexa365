import {describe,it,expect,vi,beforeEach} from "vitest";
vi.mock("@/app/lib/netlify-blob-json",()=>({shouldUseNetlifyBlobStore:()=>true}));
const mock=vi.hoisted(()=>({get:vi.fn(),getWithMetadata:vi.fn(),setJSON:vi.fn()}));
vi.mock("@netlify/blobs",()=>({getStore:()=>mock}));
import {readAgents,updateAgents,Conflict} from "./store";
import {initialData,type Command} from "./model";
const command:Command={action:"approval",agentId:"bob",reason:"Review"};
describe("Agent store durability",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("does not silently replace records after a read failure",async()=>{mock.get.mockRejectedValue(new Error("offline"));await expect(readAgents()).rejects.toThrow("offline");expect(mock.setJSON).not.toHaveBeenCalled();});
 it("rejects stale version before saving",async()=>{mock.getWithMetadata.mockResolvedValue({data:{...initialData(),version:1},etag:"v1"});await expect(updateAgents(command,0,"admin")).rejects.toBeInstanceOf(Conflict);expect(mock.setJSON).not.toHaveBeenCalled();});
 it("uses conditional create for the first save",async()=>{mock.getWithMetadata.mockResolvedValue(null);mock.setJSON.mockResolvedValue({modified:true});await updateAgents(command,0,"admin");expect(mock.setJSON.mock.calls[0][2]).toEqual({onlyIfNew:true});});
 it("rejects a concurrent overwrite and retains the conditional version",async()=>{mock.getWithMetadata.mockResolvedValue({data:initialData(),etag:"v1"});mock.setJSON.mockResolvedValue({modified:false});await expect(updateAgents(command,0,"admin")).rejects.toBeInstanceOf(Conflict);expect(mock.setJSON.mock.calls[0][2]).toEqual({onlyIfMatch:"v1"});});
});
