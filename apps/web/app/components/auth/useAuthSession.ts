"use client";

import { useEffect, useState } from "react";
import { subscribeToAuthSession, type AuthSessionState } from "./authClient";

export function useAuthSession() {
  const [state, setState] = useState<AuthSessionState>({
    status: "loading",
    session: null,
  });

  useEffect(() => subscribeToAuthSession((nextState) => setState(nextState)), []);

  return state;
}
