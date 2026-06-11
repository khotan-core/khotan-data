import { KhotanTopologyCanvas } from "@/components/khotan/topology-canvas";

export default function KhotanGraphPage() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(248,250,252,0.94),_rgba(241,245,249,0.82)_38%,_rgba(226,232,240,0.7))]">
      <div className="mx-auto max-w-[1720px] px-4 py-8 md:px-6 xl:py-10">
        <KhotanTopologyCanvas />
      </div>
    </main>
  );
}
