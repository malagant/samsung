import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ApiError } from "../api.js";
import {
  type Boost,
  type CircuitChange,
  type ControlState,
  DHW_MODES,
  HEATING_MODES,
  isRunning,
  type Range,
  useControlActions,
  useControls,
} from "../controls.js";
import { useDevices } from "../data.js";
import { fmt, time, unit } from "../i18n/format.js";
import { currentLocale } from "../i18n/index.js";
import { useT } from "../theme/ThemeProvider.js";
import { useErrorText } from "./SignIn.js";
import { Button, Card, Figure, FormError, Label, Switch } from "./ui.js";

/** Error text for a control action; falls back to the shared auth messages. */
export function useControlError() {
  const { t } = useT();
  const generic = useErrorText();
  return (err: unknown) =>
    err instanceof ApiError && err.code
      ? t(`controls.error.${err.code}`, { defaultValue: generic(err) ?? "" })
      : generic(err);
}

export function ControlsPage() {
  const { t } = useT();
  const devices = useDevices();
  const device = devices.data?.[0];
  const state = useControls(device?.id);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="m-0 font-[family-name:var(--font-display)] font-semibold text-2xl">
          {t("controls.title")}
        </h1>
        {device ? <p className="m-0 mt-1 text-muted text-sm">{device.label}</p> : null}
      </header>
      {!device ? (
        <Card>
          <p className="m-0 text-muted text-sm">
            {devices.isPending ? "…" : t("controls.noDevice")}{" "}
            {devices.isPending ? null : (
              <Link to="/settings" className="text-accent">
                {t("nav.settings")}
              </Link>
            )}
          </p>
        </Card>
      ) : state.data ? (
        <div className="grid gap-3 md:grid-cols-2">
          <CircuitCard kind="heating" deviceId={device.id} state={state.data} />
          <CircuitCard kind="dhw" deviceId={device.id} state={state.data} />
          <BoostCard deviceId={device.id} state={state.data} />
        </div>
      ) : (
        <Card>
          <p className="m-0 text-muted text-sm">
            {state.isError ? t("controls.unavailable") : "…"}
          </p>
        </Card>
      )}
    </div>
  );
}

function CircuitCard({
  kind,
  deviceId,
  state,
}: {
  kind: "heating" | "dhw";
  deviceId: string;
  state: ControlState;
}) {
  const { t } = useT();
  const l = currentLocale();
  const errorText = useControlError();
  const actions = useControlActions(deviceId);
  const action = actions[kind];
  const c = state[kind];
  const modes: readonly string[] = kind === "heating" ? HEATING_MODES : DHW_MODES;
  const locked = kind === "dhw" && isRunning(state.boost);
  const busy = action.isPending || locked;
  const color = kind === "heating" ? "var(--heat)" : "var(--dhw)";
  const apply = (change: CircuitChange) => action.mutate(change);

  return (
    <Card label={t(`controls.${kind}`)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="m-0 font-semibold text-base">{t(`controls.${kind}`)}</h2>
          <Label>
            {kind === "dhw"
              ? t("controls.tankNow", { value: unit.celsius(l, state.dhw.temperature) })
              : t("controls.heatingCircuit")}
          </Label>
        </div>
        <Switch
          checked={c.on === true}
          label={t(`controls.${kind}`)}
          color={color}
          disabled={busy || c.on === null}
          onChange={(on) => apply({ on })}
        />
      </div>

      <fieldset className="m-0 mb-4 border-0 p-0">
        <legend className="mb-2 text-muted text-xs">{t("controls.mode")}</legend>
        <div className="flex flex-wrap gap-1 rounded-[var(--control-radius)] bg-surface-2 p-1">
          {modes.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={c.mode === m}
              disabled={busy}
              onClick={() => apply({ mode: m })}
              className={`min-h-9 flex-1 rounded-[var(--control-radius)] px-3 text-sm disabled:opacity-60 ${
                c.mode === m ? "bg-surface font-medium text-text" : "text-muted"
              }`}
            >
              {t(`mode.${m}`, { defaultValue: m })}
            </button>
          ))}
        </div>
      </fieldset>

      <SetpointStepper
        label={kind === "heating" ? t("controls.flowTarget") : t("controls.dhwTargetLabel")}
        value={c.setpoint}
        range={c.range}
        disabled={busy}
        onApply={(setpoint) => apply({ setpoint })}
      />
      {locked ? <p className="m-0 mt-3 text-muted text-xs">{t("controls.lockedByBoost")}</p> : null}
      <div className="mt-3">
        <FormError message={errorText(action.error)} />
      </div>
    </Card>
  );
}

/** −/+ in 0.5 °C steps; the change is sent only when confirmed. */
function SetpointStepper({
  label,
  value,
  range,
  disabled,
  onApply,
}: {
  label: string;
  value: number | null;
  range: Range;
  disabled: boolean;
  onApply: (v: number) => void;
}) {
  const { t } = useT();
  const l = currentLocale();
  const [draft, setDraft] = useState<number | null>(value);
  useEffect(() => setDraft(value), [value]);
  const step = (d: number) =>
    setDraft((v) => Math.min(range.max, Math.max(range.min, (v ?? range.min) + d)));
  const changed = draft !== null && draft !== value;
  const btn =
    "h-11 w-11 rounded-[var(--control-radius)] border border-border bg-surface text-lg disabled:opacity-60";
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-28 flex-1">
        <Label>{label}</Label>
        <Figure value={fmt(l, draft, 1)} unit="°C" />
        <span className="text-muted text-xs">
          {t("controls.range", {
            min: unit.celsius(l, range.min, 0),
            max: unit.celsius(l, range.max, 0),
          })}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          aria-label={t("controls.cooler")}
          disabled={disabled || draft === null || draft <= range.min}
          onClick={() => step(-0.5)}
        >
          −
        </button>
        <button
          type="button"
          className={btn}
          aria-label={t("controls.warmer")}
          disabled={disabled || (draft !== null && draft >= range.max)}
          onClick={() => step(0.5)}
        >
          +
        </button>
        <Button disabled={disabled || !changed} onClick={() => draft !== null && onApply(draft)}>
          {t("controls.apply")}
        </Button>
      </div>
    </div>
  );
}

const DURATIONS = [30, 60, 90, 120] as const;

function BoostCard({ deviceId, state }: { deviceId: string; state: ControlState }) {
  const { t } = useT();
  const l = currentLocale();
  const errorText = useControlError();
  const { startBoost, cancelBoost } = useControlActions(deviceId);
  const range = state.dhw.range;
  const [target, setTarget] = useState(() => Math.min(range.max, 55));
  const [minutes, setMinutes] = useState<number>(120);
  const b = state.boost;
  const running = isRunning(b);

  return (
    <Card label={t("controls.boost")} className="md:col-span-2">
      <h2 className="m-0 mb-1 font-semibold text-base">{t("controls.boost")}</h2>
      <p className="m-0 mb-4 text-muted text-sm">{t("controls.boostIntro")}</p>
      {running && b ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p role="status" className="m-0 text-sm">
            {b.status === "active"
              ? t("controls.boostRunning", {
                  target: unit.celsius(l, b.target, 0),
                  now: unit.celsius(l, state.dhw.temperature),
                  until: time(l, new Date(b.endsAt)),
                })
              : t("controls.boostRestoring")}
          </p>
          {b.status === "active" ? (
            <Button
              variant="quiet"
              disabled={cancelBoost.isPending}
              onClick={() => cancelBoost.mutate()}
            >
              {t("controls.boostCancel")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted text-xs">{t("controls.boostTarget")}</span>
            <select
              className="min-h-11 rounded-[var(--control-radius)] border border-border bg-surface px-2"
              value={target}
              onChange={(e) => setTarget(Number(e.target.value))}
            >
              {targets(range).map((v) => (
                <option key={v} value={v}>
                  {unit.celsius(l, v, 0)}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted text-xs">{t("controls.boostDuration")}</span>
            <select
              className="min-h-11 rounded-[var(--control-radius)] border border-border bg-surface px-2"
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
            >
              {DURATIONS.map((m) => (
                <option key={m} value={m}>
                  {t("controls.minutes", { count: m })}
                </option>
              ))}
            </select>
          </label>
          <Button
            disabled={startBoost.isPending}
            onClick={() => startBoost.mutate({ target, minutes })}
          >
            {t("controls.boostStart")}
          </Button>
        </div>
      )}
      <LastBoost boost={running ? null : b} />
      <div className="mt-3">
        <FormError message={errorText(startBoost.error ?? cancelBoost.error)} />
      </div>
    </Card>
  );
}

function LastBoost({ boost }: { boost: Boost | null }) {
  const { t } = useT();
  const l = currentLocale();
  if (!boost?.finishedAt) return null;
  return (
    <p className={`m-0 mt-3 text-xs ${boost.status === "failed" ? "text-warn" : "text-muted"}`}>
      {t(
        `controls.boostEnded.${boost.status === "failed" ? "failed" : (boost.reason ?? "timeout")}`,
        {
          time: time(l, new Date(boost.finishedAt)),
        },
      )}
    </p>
  );
}

function targets(r: Range): number[] {
  const out: number[] = [];
  for (let v = Math.ceil(r.min); v <= r.max; v += 1) out.push(v);
  return out;
}
