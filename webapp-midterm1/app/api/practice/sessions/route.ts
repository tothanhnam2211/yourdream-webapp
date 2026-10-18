import { dispatchPracticeRoute } from "../../../../lib/practice-edge";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return dispatchPracticeRoute(request);
}

export async function GET(request: Request) {
  return dispatchPracticeRoute(request);
}
