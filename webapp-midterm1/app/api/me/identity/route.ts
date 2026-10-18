import { getChatGPTUser } from "../../../chatgpt-auth";
import hosting from "../../../../.openai/hosting.json";
import * as moduleValue from "../../../../src/self-identity.cjs";
const selfIdentity = (moduleValue as any).default ?? moduleValue;
export const dynamic = "force-dynamic";
export async function GET() {
  return selfIdentity.identityResponse(await getChatGPTUser(), hosting.project_id);
}
