import { type FormEvent, useState } from "react";
import { API_URL } from "../api.js";
import {
  type User,
  useAddFamily,
  useAuth,
  useChangePassword,
  useFamily,
  useLogout,
  useRemoveFamily,
  useSmartThingsStatus,
} from "../auth.js";
import { dateTime, fmt } from "../i18n/format.js";
import { currentLocale } from "../i18n/index.js";
import { useT } from "../theme/ThemeProvider.js";
import { formValues, useErrorText } from "./SignIn.js";
import { Button, Card, Field, FormError } from "./ui.js";

export function LogoutButton() {
  const { t } = useT();
  const logout = useLogout();
  return (
    <Button variant="quiet" disabled={logout.isPending} onClick={() => logout.mutate()}>
      {t("auth.logout")}
    </Button>
  );
}

/** Account, SmartThings link and family members; shown above the appearance settings. */
export function AccountSettings() {
  const auth = useAuth();
  const user = auth.data?.user;
  if (!user) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <AccountCard user={user} />
      {user.role === "owner" ? <SmartThingsCard /> : null}
      {user.role === "owner" ? <FamilyCard /> : null}
    </div>
  );
}

function AccountCard({ user }: { user: User }) {
  const { t } = useT();
  const errorText = useErrorText();
  const change = useChangePassword();
  const [done, setDone] = useState(false);

  const submit = (e: FormEvent<HTMLFormElement>) => {
    const { get, form } = formValues(e);
    setDone(false);
    change.mutate(
      { current: get("current"), next: get("next") },
      {
        onSuccess: () => {
          form.reset();
          setDone(true);
        },
      },
    );
  };

  return (
    <Card label={t("account.title")}>
      <h2 className="m-0 mb-1 font-semibold text-base">{t("account.title")}</h2>
      <p className="m-0 mb-4 text-muted text-sm">
        {user.displayName ? `${user.displayName} · ` : ""}
        {user.email} · {t(`account.role.${user.role}`)}
      </p>
      <form className="flex flex-col gap-3" onSubmit={submit}>
        <Field
          label={t("account.currentPassword")}
          name="current"
          type="password"
          autoComplete="current-password"
        />
        <Field
          label={t("account.newPassword")}
          name="next"
          type="password"
          autoComplete="new-password"
          minLength={10}
          hint={t("auth.passwordHint")}
        />
        <FormError message={errorText(change.error)} />
        {done ? (
          <p role="status" className="m-0 text-ok text-sm">
            {t("account.passwordChanged")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={change.isPending}>
            {t("account.changePassword")}
          </Button>
          <LogoutButton />
        </div>
      </form>
    </Card>
  );
}

function SmartThingsCard() {
  const { t } = useT();
  const st = useSmartThingsStatus();
  const params = new URLSearchParams(window.location.search);
  const result = params.get("smartthings");
  const s = st.data;
  return (
    <Card label="SmartThings">
      <h2 className="m-0 mb-1 font-semibold text-base">SmartThings</h2>
      {result === "linked" ? (
        <p role="status" className="m-0 mb-2 text-ok text-sm">
          {t("smartthings.linkedNow")}
        </p>
      ) : result === "denied" ? (
        <p role="alert" className="m-0 mb-2 text-sm text-warn">
          {t("smartthings.denied")}
        </p>
      ) : null}
      <p className="m-0 mb-4 text-muted text-sm">
        {!s
          ? "…"
          : s.linked
            ? t(`smartthings.status.${s.pollingStatus === "failing" ? "failing" : "active"}`, {
                time: s.lastSuccessfulPoll
                  ? dateTime(currentLocale(), new Date(s.lastSuccessfulPoll))
                  : "–",
              })
            : t("smartthings.status.unlinked")}
      </p>
      {s ? (
        <p className="m-0 mb-4 font-[family-name:var(--font-mono)] text-muted text-xs">
          {t("smartthings.budget", {
            calls: fmt(currentLocale(), s.callsThisMonth, 0),
            budget: fmt(currentLocale(), s.monthlyBudget, 0),
          })}
        </p>
      ) : null}
      <a
        href={`${API_URL}/auth/smartthings`}
        className="inline-flex min-h-11 items-center rounded-[var(--control-radius)] bg-accent px-4 font-medium text-on-accent text-sm no-underline"
      >
        {s?.linked ? t("smartthings.relink") : t("smartthings.link")}
      </a>
    </Card>
  );
}

function FamilyCard() {
  const { t } = useT();
  const errorText = useErrorText();
  const family = useFamily(true);
  const add = useAddFamily();
  const remove = useRemoveFamily();

  const submit = (e: FormEvent<HTMLFormElement>) => {
    const { get, form } = formValues(e);
    add.mutate(
      {
        email: get("email"),
        password: get("password"),
        ...(get("displayName") ? { displayName: get("displayName") } : {}),
      },
      { onSuccess: () => form.reset() },
    );
  };

  return (
    <Card label={t("family.title")} className="md:col-span-2">
      <h2 className="m-0 mb-1 font-semibold text-base">{t("family.title")}</h2>
      <p className="m-0 mb-4 text-muted text-sm">{t("family.intro")}</p>
      {family.data && family.data.length > 0 ? (
        <ul className="m-0 mb-4 flex list-none flex-col gap-2 p-0">
          {family.data.map((m) => (
            <li
              key={m.id}
              className="flex flex-wrap items-center gap-3 rounded-[var(--control-radius)] border border-border px-3 py-2"
            >
              <span className="min-w-0 flex-1 text-sm">
                {m.displayName ? <strong className="mr-2">{m.displayName}</strong> : null}
                <span className="text-muted">{m.email}</span>
              </span>
              <Button
                variant="danger"
                disabled={remove.isPending}
                onClick={() => {
                  if (
                    window.confirm(t("family.removeConfirm", { name: m.displayName ?? m.email }))
                  ) {
                    remove.mutate(m.id);
                  }
                }}
              >
                {t("family.remove")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 mb-4 text-muted text-sm">{t("family.empty")}</p>
      )}
      <form className="grid gap-3 md:grid-cols-3" onSubmit={submit}>
        <Field
          label={t("auth.displayName")}
          name="displayName"
          autoComplete="off"
          required={false}
        />
        <Field label={t("auth.email")} name="email" type="email" autoComplete="off" />
        <Field
          label={t("family.initialPassword")}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
        />
        <div className="flex flex-col gap-2 md:col-span-3">
          <FormError message={errorText(add.error ?? remove.error)} />
          <div>
            <Button type="submit" disabled={add.isPending}>
              {t("family.add")}
            </Button>
          </div>
        </div>
      </form>
    </Card>
  );
}
