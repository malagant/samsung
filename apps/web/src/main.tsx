import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiError } from "./api.js";
import { AUTH_KEY } from "./auth.js";
import "./i18n/index.js";
import { routeTree } from "./routes.js";
import "./styles/app.css";
import { ThemeProvider } from "./theme/ThemeProvider.js";

// A 401 anywhere means the session ended (expired, password changed, removed):
// re-check the auth state so the app falls back to the login screen.
const onError = (err: unknown) => {
  if (err instanceof ApiError && err.status === 401) {
    void queryClient.invalidateQueries({ queryKey: AUTH_KEY });
  }
};
const queryClient: QueryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  mutationCache: new MutationCache({ onError }),
});
const router = createRouter({ routeTree, context: { queryClient } });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const root = document.getElementById("root");
if (!root) throw new Error("#root missing");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <RouterProvider router={router} />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
