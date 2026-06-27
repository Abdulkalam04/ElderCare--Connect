import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 minutes fresh data cache (instant transitions!)
        gcTime: 1000 * 60 * 15, // 15 minutes cache retention
        refetchOnWindowFocus: false, // avoid refetch latency when focusing tab
        refetchOnMount: false, // use cached data instantly when switching routes
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent", // Instantly preload routes on hover/touch!
    defaultPreloadStaleTime: 1000 * 60 * 5,
  });

  return router;
};
