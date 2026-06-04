import { storage } from "./firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

export async function uploadImageFromBuffer(
  buffer: Buffer,
  path: string,
  contentType: string
): Promise<string> {
  const storageRef = ref(storage, path);
  const snapshot = await uploadBytes(storageRef, buffer, { contentType });
  return getDownloadURL(snapshot.ref);
}

export async function uploadImageFromFile(
  file: File,
  uid: string,
  type: "model" | "garment"
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `users/${uid}/${type}/${Date.now()}.${ext}`;
  const storageRef = ref(storage, path);
  const buffer = await file.arrayBuffer();
  const snapshot = await uploadBytes(storageRef, Buffer.from(buffer), {
    contentType: file.type,
  });
  return getDownloadURL(snapshot.ref);
}
