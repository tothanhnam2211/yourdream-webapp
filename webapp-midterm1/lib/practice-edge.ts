import { env } from "cloudflare:workers";
import hostingConfig from "../.openai/hosting.json";
import { getChatGPTUser } from "../app/chatgpt-auth";
import rawContent from "../vendor/radical-steps-v0.1.json?raw";
import * as httpEdgeModule from "../src/http-edge.cjs";
import * as engineModule from "../vendor/radicals-engine.cjs";

const httpEdge =
  (httpEdgeModule as unknown as { default?: typeof httpEdgeModule }).default ??
  httpEdgeModule;
const engine =
  (engineModule as unknown as { default?: typeof engineModule }).default ??
  engineModule;

export async function dispatchPracticeRoute(request: Request): Promise<Response> {
  const user = await getChatGPTUser();
  const runtimeEnv = env as Cloudflare.Env & Record<string, unknown>;
  const siteId =
    (typeof runtimeEnv.YOURDREAM_SITE_ID === "string" &&
      runtimeEnv.YOURDREAM_SITE_ID.trim()) ||
    hostingConfig.project_id;
  const pilotOperatorSubject =
    typeof runtimeEnv.YOURDREAM_PILOT_OPERATOR_SUBJECT_ID === "string" &&
    runtimeEnv.YOURDREAM_PILOT_OPERATOR_SUBJECT_ID.trim()
      ? runtimeEnv.YOURDREAM_PILOT_OPERATOR_SUBJECT_ID.trim()
      : null;

  return httpEdge.handlePracticeApiRequest({
    request,
    db: runtimeEnv.DB,
    user,
    siteId,
    rawContent,
    sha256: httpEdge.DEFAULT_SHA256,
    engine,
    pilotOperatorSubject,
    forbidSyntheticSubjects: true,
  });
}
