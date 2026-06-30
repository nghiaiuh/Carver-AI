import { NextResponse } from "next/server";
import { getRequestContext } from "../../../_lib/auth";
import { badRequest } from "../../../_lib/http";
import { deleteLibraryAsset } from "../../../../../lib/server/library";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { assetId } = await params;
  if (!assetId) {
    return badRequest("assetId is required");
  }

  try {
    await deleteLibraryAsset({
      ownerId: context.user.id,
      assetId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete asset." },
      { status: 500 },
    );
  }
}
