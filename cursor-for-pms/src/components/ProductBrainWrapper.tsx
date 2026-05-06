"use client";

import ProductBrain from "./ProductBrain";

export default function ProductBrainWrapper({ projectId }: { projectId: string }) {
  return <ProductBrain projectId={projectId} />;
}
