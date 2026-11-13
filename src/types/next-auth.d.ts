import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string;
      image?: string | null;
      role: "admin" | "customer";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "admin" | "customer";
  }
}
