import assert from "node:assert/strict";
import test from "node:test";
import { getDroppedCanvasImageFiles, hasCanvasFileDrop } from "./canvasClipboard";

test("keeps only image files dropped onto the canvas", () => {
  const imageFile = { name: "site-plan.png", type: "image/png" } as File;
  const documentFile = { name: "brief.pdf", type: "application/pdf" } as File;
  const dropped = { files: [imageFile, documentFile] } as unknown as DataTransfer;

  assert.deepEqual(getDroppedCanvasImageFiles(dropped), [imageFile]);
});

test("recognizes an operating-system file drag before files are readable", () => {
  const protectedDrag = { types: ["Files"] } as unknown as Pick<DataTransfer, "types">;

  assert.equal(hasCanvasFileDrop(protectedDrag), true);
});
