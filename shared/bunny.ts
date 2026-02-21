export interface BunnyConfig {
  storageZone: string;
  storageApiKey: string;
  cdnHostname: string;
  storageRegion?: string;
}

export async function uploadToBunny(
  fileData: Uint8Array,
  fileName: string,
  config: BunnyConfig,
): Promise<string> {
  const region = config.storageRegion || "storage.bunnycdn.com";
  const url = `https://${region}/${config.storageZone}/${fileName}`;

  const res = await fetch(url, {
    method: "PUT",
    headers: {
      AccessKey: config.storageApiKey,
      "Content-Type": "application/octet-stream",
    },
    body: fileData,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bunny upload failed (${res.status}): ${body}`);
  }

  return `https://${config.cdnHostname}/${fileName}`;
}

export async function deleteFromBunny(
  fileName: string,
  config: BunnyConfig,
): Promise<void> {
  const region = config.storageRegion || "storage.bunnycdn.com";
  const url = `https://${region}/${config.storageZone}/${fileName}`;

  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      AccessKey: config.storageApiKey,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bunny delete failed (${res.status}): ${body}`);
  }
}
