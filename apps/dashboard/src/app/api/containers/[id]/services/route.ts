/**
 * API route to fetch discovered services for a container.
 * Used by the progress page on completion to display services and credentials.
 */

import { NextRequest, NextResponse } from "next/server";
import { DatabaseService } from "@/lib/db";
import { getSessionData } from "@/lib/session";
import { decrypt } from "@/lib/encryption";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Validate session — only authenticated users can access services/credentials
  const session = await getSessionData();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: containerId } = await params;

  const container = await DatabaseService.getContainerById(containerId);
  if (!container) {
    return NextResponse.json({ error: "Container not found" }, { status: 404 });
  }

  const services = await DatabaseService.getContainerServices(containerId);

  // Decrypt credentials server-side before sending to client
  const decryptedServices = services.map((service) => ({
    ...service,
    credentials: service.credentials
      ? (() => {
          try {
            return decrypt(service.credentials);
          } catch {
            return null;
          }
        })()
      : null,
  }));

  return NextResponse.json(decryptedServices);
}
