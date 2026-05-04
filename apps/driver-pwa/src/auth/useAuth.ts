import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { getMe } from "../api/identity";

export function useAuth() {
  const query = useQuery({
    queryKey: ["auth", "me"],
    queryFn: getMe,
    retry: (count, error) => {
      if (error instanceof ApiError && error.status === 401) return false;
      return count < 1;
    },
  });

  return {
    user: query.data?.user ?? null,
    session: query.data?.session ?? null,
    isLoading: query.isLoading,
    isUnauthenticated: query.error instanceof ApiError && query.error.status === 401,
  };
}
