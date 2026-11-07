import { VIDEO_SEARCH_BUILD_STATUS } from "@/app/lib/video-search/build-status";

export function VideoSearchBuildStatus() {
  return (
    <section className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] p-4">
      <h2 className="text-sm font-bold">Video Search & Import · Phase 1</h2>
      <ul className="mt-3 space-y-2">
        {VIDEO_SEARCH_BUILD_STATUS.map((item) => (
          <li key={item.id} className="text-sm">
            <strong>{item.label}</strong> · {item.status}
            <span className="block text-[color:var(--text-secondary)]">{item.note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
