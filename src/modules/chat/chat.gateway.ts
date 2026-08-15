import { Server, Socket } from 'socket.io';
import { container } from 'tsyringe';
import { ChatService } from './chat.service';
import { MessageType } from '../../entities/ChatMessage';
import { SocketSendMessageSchema, SocketJoinRoomSchema } from './chat.dto';

interface SocketData {
  uid: string;
  userId: string;
}

export function registerChatGateway(io: Server, socket: Socket): void {
  const chatService = container.resolve(ChatService);
  const socketData = socket.data as SocketData;
  const userId = socketData.userId;

  socket.on('join_room', (data: unknown) => {
    const parsed = SocketJoinRoomSchema.safeParse(data);
    if (!parsed.success) {
      socket.emit('error', { message: 'Invalid join_room data' });
      return;
    }
    // Without this check, any authenticated socket could join (and thus
    // read/post into) a booking's chat room it has no relationship to —
    // the REST endpoints already gate every action on this same check.
    void chatService
      .assertParticipant(parsed.data.bookingId, userId)
      .then(() => {
        void socket.join(parsed.data.bookingId);
        socket
          .to(parsed.data.bookingId)
          .emit('user_joined', { userId, socketId: socket.id });
      })
      .catch(() => {
        socket.emit('error', { message: 'Not authorized to join this chat' });
      });
  });

  socket.on('leave_room', (data: unknown) => {
    const parsed = SocketJoinRoomSchema.safeParse(data);
    if (!parsed.success) return;
    void socket.leave(parsed.data.bookingId);
    socket.to(parsed.data.bookingId).emit('user_left', { userId });
  });

  socket.on('send_message', (data: unknown) => {
    const parsed = SocketSendMessageSchema.safeParse(data);
    if (!parsed.success) {
      socket.emit('error', { message: 'Invalid message data' });
      return;
    }

    // saveMessage() itself has no participant check (it's also used
    // internally after sendMessage() already checked) — must gate here,
    // same as join_room above.
    void chatService
      .assertParticipant(parsed.data.bookingId, userId)
      .then(() =>
        chatService.saveMessage(
          parsed.data.bookingId,
          userId,
          parsed.data.type as MessageType,
          parsed.data.content,
          parsed.data.fileUrl,
        ),
      )
      .then((msg) => {
        io.to(parsed.data.bookingId).emit('new_message', msg);
      })
      .catch(() => {
        socket.emit('error', { message: 'Failed to save message' });
      });
  });

  socket.on('typing', (data: unknown) => {
    const parsed = SocketJoinRoomSchema.safeParse(data);
    if (!parsed.success) return;
    socket.to(parsed.data.bookingId).emit('typing', { userId });
  });

  socket.on('read_receipt', (data: unknown) => {
    const parsed = SocketJoinRoomSchema.safeParse(data);
    if (!parsed.success) return;
    void chatService
      .markAsRead(parsed.data.bookingId, userId)
      .then(() => {
        socket.to(parsed.data.bookingId).emit('read_receipt', { userId });
      })
      .catch(() => {
        socket.emit('error', { message: 'Failed to mark as read' });
      });
  });
}
