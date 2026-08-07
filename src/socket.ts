import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { container } from 'tsyringe';
import { IAuthProvider } from './providers/auth/auth.provider.interface';
import { AUTH_PROVIDER } from './config/container';
import { env } from './config/env';
import { AppDataSource } from './config/database';
import { User } from './entities/User';
import { registerChatGateway } from './modules/chat/chat.gateway';

export let io: Server;

interface SocketData {
  uid: string;
  userId: string;
}

export function initSocket(server: HttpServer): Server {
  const allowedOrigins = env.SOCKET_CORS_ORIGIN.split(',').map((o) => o.trim());
  io = new Server(server, {
    cors: {
      origin: allowedOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  io.use((socket: Socket, next) => {
    void (async (): Promise<void> => {
      try {
        const token =
          (socket.handshake.auth as Record<string, unknown>)['token'] ??
          socket.handshake.headers['authorization'];

        if (typeof token !== 'string') {
          next(new Error('Authentication error: missing token'));
          return;
        }

        const rawToken = token.startsWith('Bearer ') ? token.slice(7) : token;
        const authProvider = container.resolve<IAuthProvider>(AUTH_PROVIDER);
        const decoded = await authProvider.verifyToken(rawToken);

        const user = await AppDataSource.getRepository(User).findOne({
          where: { firebaseUid: decoded.uid },
        });
        if (!user) {
          next(new Error('Authentication error: user not found'));
          return;
        }

        const socketData = socket.data as SocketData;
        socketData.uid = decoded.uid;
        socketData.userId = user.id;
        next();
      } catch {
        next(new Error('Authentication error: invalid token'));
      }
    })();
  });

  io.on('connection', (socket: Socket) => {
    registerChatGateway(io, socket);

    socket.on('disconnect', () => {
      const rooms = Array.from(socket.rooms).filter((r) => r !== socket.id);
      rooms.forEach((roomId) => {
        socket.to(roomId).emit('user_offline', { socketId: socket.id });
      });
    });
  });

  return io;
}
