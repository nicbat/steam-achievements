export type ViewKey = "overview" | "achievements" | "library" | "optimizer" | "howitworks";

const TABS: { key: ViewKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "achievements", label: "Achievements" },
  { key: "library", label: "Library" },
  { key: "optimizer", label: "Optimizer" },
  { key: "howitworks", label: "How it works" },
];

interface Props {
  active: ViewKey;
  onChange: (v: ViewKey) => void;
}

export function Nav({ active, onChange }: Props) {
  return (
    <nav className="nav" aria-label="Sections">
      {TABS.map((t) => (
        <button
          key={t.key}
          className={`nav__tab${active === t.key ? " nav__tab--active" : ""}`}
          aria-current={active === t.key ? "page" : undefined}
          onClick={() => onChange(t.key)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
