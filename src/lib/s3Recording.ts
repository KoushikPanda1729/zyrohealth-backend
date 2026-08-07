import { S3 } from 'aws-sdk';
import {
  EncodedFileOutput,
  EncodedFileType,
  S3Upload,
  RoomEgress,
  RoomCompositeEgressRequest,
} from 'livekit-server-sdk';
import { env } from '../config/env';

const RECORDINGS_FOLDER = 'recordings';

export const buildRecordingFilePath = (
  doctorId: string,
  agentId: string,
): string => `${RECORDINGS_FOLDER}/${doctorId}/${agentId}/{room_name}.ogg`;

export const buildRecordingUrl = (
  doctorId: string,
  agentId: string,
  roomName: string,
): string => {
  const key = `${RECORDINGS_FOLDER}/${doctorId}/${agentId}/${roomName}.ogg`;
  return `https://${env.STORAGE_BUCKET_NAME}.s3.${env.STORAGE_REGION}.amazonaws.com/${key}`;
};

export const buildS3EgressOutput = (
  doctorId: string,
  agentId: string,
): EncodedFileOutput => {
  const filepath = buildRecordingFilePath(doctorId, agentId);
  return new EncodedFileOutput({
    fileType: EncodedFileType.OGG,
    filepath,
    output: {
      case: 's3',
      value: new S3Upload({
        bucket: env.STORAGE_BUCKET_NAME,
        region: env.STORAGE_REGION,
        accessKey: env.STORAGE_ACCESS_KEY,
        secret: env.STORAGE_SECRET_KEY,
      }),
    },
  });
};

export const buildRoomEgress = (
  doctorId: string,
  agentId: string,
): RoomEgress =>
  new RoomEgress({
    room: new RoomCompositeEgressRequest({
      roomName: '',
      audioOnly: true,
      fileOutputs: [buildS3EgressOutput(doctorId, agentId)],
    }),
  });

export const getPresignedRecordingUrl = async (
  recordingUrl: string,
): Promise<string | null> => {
  try {
    const key = new URL(recordingUrl).pathname.slice(1);
    if (!key) return null;
    const s3 = new S3({
      accessKeyId: env.STORAGE_ACCESS_KEY,
      secretAccessKey: env.STORAGE_SECRET_KEY,
      region: env.STORAGE_REGION,
    });
    return s3.getSignedUrlPromise('getObject', {
      Bucket: env.STORAGE_BUCKET_NAME,
      Key: key,
      Expires: 3600,
    });
  } catch {
    return null;
  }
};
