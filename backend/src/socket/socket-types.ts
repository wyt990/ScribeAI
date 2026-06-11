import type { Socket } from "socket.io";

export type AuthenticatedSocket = Socket & {
  data: Socket["data"] & {
    userId: string;
    userEmail?: string;
  };
};

export function getSocketUserId(socket: Socket): string | null {
  const id = (socket as AuthenticatedSocket).data?.userId;
  return typeof id === "string" && id ? id : null;
}

/** 校验当前 socket 已鉴权，且（若提供）payload userId 与 token 一致 */
export function assertSocketUser(
  socket: Socket,
  payloadUserId?: string
): string | null {
  const authUserId = getSocketUserId(socket);
  if (!authUserId) return null;
  if (payloadUserId && payloadUserId !== authUserId) return null;
  return authUserId;
}
