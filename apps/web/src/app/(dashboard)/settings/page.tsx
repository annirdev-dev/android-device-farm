"use client";

import * as React from "react";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { api, ApiError } from "@/lib/api-client";

interface Member {
  userId: string;
  role: string;
  user: { id: string; name: string | null; email: string };
}

export default function SettingsPage() {
  const { user, currentOrg } = useAuth();
  const [members, setMembers] = React.useState<Member[]>([]);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [inviteRole, setInviteRole] = React.useState("MEMBER");

  const load = React.useCallback(() => {
    if (!currentOrg) return;
    api.get<{ organization: { members: Member[] } }>(`/api/organizations/${currentOrg.id}`).then((r) => setMembers(r.organization.members));
  }, [currentOrg]);

  React.useEffect(load, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!currentOrg) return;
    try {
      await api.post(`/api/organizations/${currentOrg.id}/members`, { email: inviteEmail, role: inviteRole });
      toast.success("Member added");
      setInviteEmail("");
      load();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to invite member");
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile and organization.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Name</span>
            <span>{user?.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Email</span>
            <span>{user?.email}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>{currentOrg?.name}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="divide-y divide-border">
            {members.map((m) => (
              <div key={m.userId} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <p>{m.user.name ?? m.user.email}</p>
                  <p className="text-xs text-muted-foreground">{m.user.email}</p>
                </div>
                <span className="text-xs text-muted-foreground">{m.role}</span>
              </div>
            ))}
          </div>

          <form onSubmit={invite} className="flex items-end gap-2 border-t border-border pt-4">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="invite-email">Invite by email</Label>
              <Input id="invite-email" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            </div>
            <Select className="w-32" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
              <option value="MEMBER">Member</option>
              <option value="ADMIN">Admin</option>
              <option value="BILLING">Billing</option>
            </Select>
            <Button type="submit">
              <UserPlus className="h-4 w-4" />
              Invite
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
