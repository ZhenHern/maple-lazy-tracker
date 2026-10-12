import { NextResponse, type NextRequest } from "next/server";
import { getClassifiedPost, scrapePost } from "@/lib/pipeline";

// Local development only. GET /api/dev/classify?id=<nexon post id>[&dry=1]
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse(null, { status: 404 });
  }

  const params = request.nextUrl.searchParams;
  const id = params.get("id") ?? undefined;
  if (id !== undefined && !/^\d+$/.test(id)) {
    return NextResponse.json({ error: "id must be numeric" }, { status: 400 });
  }

  try {
    if (params.has("dry")) {
      const { text, ...post } = await scrapePost(id);
      return NextResponse.json({
        ...post,
        textChars: text.length,
        textPreview: text.slice(0, 3000),
      });
    }
    return NextResponse.json(await getClassifiedPost(id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
