import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    async headers() {
        return [
            {
                source: "/(.*)",
                headers: [
                    { key: "Access-Control-Allow-Origin", value: "*" },
                ],
            },
        ];
    },
};

export default nextConfig;
