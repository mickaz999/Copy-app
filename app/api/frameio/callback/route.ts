import { NextRequest } from "next/server";
import { GET as callback } from "@/app/api/connect/[provider]/callback/route";

export const dynamic = "force-dynamic";

// Retour de la connexion Adobe (adresse déclarée dans la console Adobe)
export const GET = (req: NextRequest) => callback(req, { params: { provider: "frameio" } });
