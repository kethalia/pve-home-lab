"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAction } from "next-safe-action/hooks";
import { loginAction } from "@/lib/auth/actions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function LoginPage() {
  const router = useRouter();
  const { execute, result, isPending } = useAction(loginAction);

  useEffect(() => {
    if (result.data?.success) {
      router.push("/");
    }
  }, [result.data?.success, router]);

  const error =
    result.serverError ||
    result.validationErrors?.username?._errors?.[0] ||
    result.validationErrors?.password?._errors?.[0] ||
    result.validationErrors?.realm?._errors?.[0];

  function handleSubmit(formData: FormData) {
    execute({
      username: formData.get("username") as string,
      password: formData.get("password") as string,
      realm: formData.get("realm") as "pam" | "pve",
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl">LXC Manager</CardTitle>
        <CardDescription>
          Sign in with your Proxmox VE credentials
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
            <Input
              id="username"
              name="username"
              placeholder="admin"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="realm" className="text-sm font-medium">
              Realm
            </label>
            <select
              id="realm"
              name="realm"
              defaultValue="pam"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] md:text-sm"
            >
              <option value="pam">Linux PAM</option>
              <option value="pve">Proxmox VE</option>
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <Input id="password" name="password" type="password" required />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
