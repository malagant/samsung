import { demo } from "../demo.js";
import { fmt, time, unit } from "../i18n/format.js";
import { currentLocale } from "../i18n/index.js";
import { useT } from "../theme/ThemeProvider.js";
import { Card, Figure, Label, Switch } from "./ui.js";

const SEG_COLOR = { heating: "var(--heat)", dhw: "var(--dhw)", idle: "var(--idle)" } as const;

export function Overview() {
  const { t } = useT();
  const l = currentLocale();
  const d = demo;
  const c = d.curve;
  // Point on the curve for the current outdoor temperature.
  const share = (d.outdoorTemp - c.coldOutdoor) / (c.warmOutdoor - c.coldOutdoor);
  const nowFlow = c.coldFlow + (c.warmFlow - c.coldFlow) * share;
  const x = (o: number) => ((o - c.coldOutdoor) / (c.warmOutdoor - c.coldOutdoor)) * 360;
  const y = (f: number) => ((60 - f) / 40) * 160;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="m-0 font-[family-name:var(--font-display)] font-semibold text-2xl">
            {t("overview.title")}
          </h1>
          <p className="m-0 mt-1 text-muted text-sm">
            {t("overview.subtitle", { model: d.model, time: time(l, d.updatedAt) })} ·{" "}
            <span className="font-medium text-warn">{t("status.demo")}</span>
          </p>
        </div>
        <fieldset className="m-0 flex rounded-[var(--control-radius)] border-0 bg-surface-2 p-1">
          <legend className="sr-only">{t("range.label")}</legend>
          {(["6h", "24h", "7d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={r === "24h"}
              className="min-h-9 rounded-[var(--control-radius)] px-3 text-muted text-sm aria-pressed:bg-surface aria-pressed:font-medium aria-pressed:text-text"
            >
              {t(`range.${r}`)}
            </button>
          ))}
        </fieldset>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card label={t("kpi.heating")}>
          <div className="flex justify-between">
            <Label>{t("kpi.heating")}</Label>
            <Label className="font-medium !text-ok">
              ● {t(d.heatingOn ? "kpi.on" : "kpi.off")}
            </Label>
          </div>
          <Figure value={fmt(l, d.flowTemp)} unit="°C" color="var(--heat)" />
          <Label>
            {t("kpi.targetReturn", {
              target: fmt(l, d.flowSetpoint),
              return: fmt(l, d.returnTemp),
            })}
          </Label>
        </Card>
        <Card label={t("kpi.dhw")}>
          <div className="flex justify-between">
            <Label>{t("kpi.dhw")}</Label>
            <Label className="font-medium">{t("kpi.standby")}</Label>
          </div>
          <Figure value={fmt(l, d.dhwTemp)} unit="°C" color="var(--dhw)" />
          <Label>
            {t("kpi.targetMode", {
              target: fmt(l, d.dhwSetpoint, 0),
              mode: t(`mode.${d.dhwMode}`),
            })}
          </Label>
        </Card>
        <Card label={t("kpi.outdoor")}>
          <Label>{t("kpi.outdoor")}</Label>
          <Figure value={fmt(l, d.outdoorTemp)} unit="°C" />
          <Label>{t("kpi.minMax", { min: fmt(l, d.outdoorMin), max: fmt(l, d.outdoorMax) })}</Label>
        </Card>
        <Card label={t("kpi.energy24h")}>
          <Label>{t("kpi.energy24h")}</Label>
          <Figure value={fmt(l, d.energyKwh24h)} unit="kWh" />
          <Label>
            {t("plant.compressor")} {d.compressorHz} Hz · {fmt(l, d.flowRateLpm, 0)} l/min ·{" "}
            {t("plant.pump")} {d.pumpPercent} %
          </Label>
        </Card>
      </div>

      <Card label={t("timeline.title")}>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="m-0 font-semibold text-base">{t("timeline.title")}</h2>
          <Label>{t("timeline.sample")}</Label>
        </div>
        <div className="flex h-8 gap-0.5 overflow-hidden rounded-[min(var(--radius),6px)]">
          {d.timeline.map(([kind, w], i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static sample segments
            <div key={i} style={{ flexGrow: w, background: SEG_COLOR[kind] }} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-muted text-xs">
          {(["heating", "dhw", "idle"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SEG_COLOR[k] }} />
              {t(`timeline.${k}`)}
            </span>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2">
        <Card label={t("controls.title")}>
          <h2 className="m-0 mb-2 font-semibold text-base">{t("controls.title")}</h2>
          <div className="flex items-center justify-between border-border border-b py-2.5">
            <div>
              <div className="font-medium text-sm">{t("controls.heating")}</div>
              <Label>{t("controls.heatingCircuit")}</Label>
            </div>
            <Switch checked={d.heatingOn} label={t("controls.heating")} color="var(--heat)" />
          </div>
          <div className="flex items-center justify-between border-border border-b py-2.5">
            <div>
              <div className="font-medium text-sm">{t("controls.dhw")}</div>
              <Label>{t("controls.dhwTarget", { value: unit.celsius(l, d.dhwSetpoint, 0) })}</Label>
            </div>
            <Switch checked={d.dhwOn} label={t("controls.dhw")} color="var(--dhw)" />
          </div>
          <div className="flex items-center justify-between gap-3 py-2.5">
            <div>
              <div className="font-medium text-sm">{t("controls.boost")}</div>
              <Label>{t("controls.boostHint", { value: unit.celsius(l, d.boostTarget, 0) })}</Label>
            </div>
            <button
              type="button"
              className="min-h-11 rounded-[var(--control-radius)] bg-accent px-4 font-medium text-on-accent text-sm"
            >
              {t("controls.boostStart")}
            </button>
          </div>
        </Card>
        <Card label={t("curve.title")}>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="m-0 font-semibold text-base">{t("curve.title")}</h2>
            <Label>{t("curve.zone1")}</Label>
          </div>
          <svg
            viewBox="0 0 360 170"
            width="100%"
            height="170"
            role="img"
            aria-label={t("curve.aria", {
              coldFlow: unit.celsius(l, c.coldFlow, 0),
              coldOut: unit.celsius(l, c.coldOutdoor, 0),
              warmFlow: unit.celsius(l, c.warmFlow, 0),
              warmOut: unit.celsius(l, c.warmOutdoor, 0),
              nowFlow: unit.celsius(l, nowFlow),
              nowOut: unit.celsius(l, d.outdoorTemp),
            })}
          >
            <line x1="0" y1="160" x2="360" y2="160" stroke="var(--border)" />
            <line x1="0" y1="80" x2="360" y2="80" stroke="var(--border)" strokeDasharray="3 4" />
            <line
              x1="0"
              y1={y(c.coldFlow)}
              x2="360"
              y2={y(c.warmFlow)}
              stroke="var(--heat)"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <circle
              cx={x(d.outdoorTemp)}
              cy={y(nowFlow)}
              r="6"
              fill="var(--surface)"
              stroke="var(--heat)"
              strokeWidth="3"
            />
            <text
              x={x(d.outdoorTemp) + 10}
              y={y(nowFlow) - 8}
              fontSize="12"
              fill="var(--text)"
              fontFamily="var(--font-mono)"
            >
              {unit.celsius(l, nowFlow)}
            </text>
          </svg>
          <div className="flex justify-between font-[family-name:var(--font-mono)] text-muted text-xs">
            <span>
              {t("curve.cold", {
                outdoor: unit.celsius(l, c.coldOutdoor, 0),
                flow: fmt(l, c.coldFlow, 0),
              })}
            </span>
            <span>
              {t("curve.cold", {
                outdoor: unit.celsius(l, c.warmOutdoor, 0),
                flow: fmt(l, c.warmFlow, 0),
              })}
            </span>
          </div>
        </Card>
      </div>
    </div>
  );
}
