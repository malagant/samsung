import type { FormEvent } from "react";
import { ApiError } from "../api.js";
import { useSignIn } from "../auth.js";
import { useT } from "../theme/ThemeProvider.js";
import { QuickControls } from "./Appearance.js";
import { Button, Card, Field, FormError } from "./ui.js";

/** Maps an API error to a translated message. */
export function useErrorText() {
  const { t } = useT();
  return (err: unknown): string | null => {
    if (!err) return null;
    const code = err instanceof ApiError ? (err.code ?? `http_${err.status}`) : "network";
    return t(`auth.error.${code}`, { defaultValue: t("auth.error.generic") });
  };
}

export function formValues(e: FormEvent<HTMLFormElement>) {
  e.preventDefault();
  const data = new FormData(e.currentTarget);
  const get = (k: string) => String(data.get(k) ?? "");
  return { get, form: e.currentTarget };
}

/** Login, or the one-time owner setup on first start. */
export function SignIn({ setup }: { setup: boolean }) {
  const { t } = useT();
  const errorText = useErrorText();
  const signIn = useSignIn(setup ? "setup" : "login");
  const kind = setup ? "setup" : "login";

  const submit = (e: FormEvent<HTMLFormElement>) => {
    const { get } = formValues(e);
    signIn.mutate({
      email: get("email"),
      password: get("password"),
      ...(setup && get("displayName") ? { displayName: get("displayName") } : {}),
    });
  };

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <div className="flex justify-end p-3">
        <QuickControls />
      </div>
      <main className="flex flex-1 items-start justify-center px-4 pt-[8vh] pb-10">
        <div className="flex w-full max-w-sm flex-col gap-4">
          <div>
            <p className="m-0 text-muted text-sm">{t("brand.tagline")}</p>
            <h1 className="m-0 font-[family-name:var(--font-display)] font-semibold text-3xl">
              {t(`auth.${kind}.title`)}
            </h1>
            {setup ? <p className="mt-2 mb-0 text-muted text-sm">{t("auth.setup.intro")}</p> : null}
          </div>
          <Card>
            <form className="flex flex-col gap-4" onSubmit={submit}>
              {setup ? (
                <Field
                  label={t("auth.displayName")}
                  name="displayName"
                  autoComplete="name"
                  required={false}
                />
              ) : null}
              <Field label={t("auth.email")} name="email" type="email" autoComplete="username" />
              <Field
                label={t("auth.password")}
                name="password"
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                minLength={setup ? 10 : undefined}
                hint={setup ? t("auth.passwordHint") : undefined}
              />
              <FormError message={errorText(signIn.error)} />
              <Button type="submit" disabled={signIn.isPending}>
                {t(`auth.${kind}.submit`)}
              </Button>
            </form>
          </Card>
          {!setup ? <p className="m-0 text-muted text-xs">{t("auth.login.forgot")}</p> : null}
        </div>
      </main>
    </div>
  );
}
