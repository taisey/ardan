import { google, type drive_v3 } from 'googleapis';

export class GoogleDriveClient {
  private readonly drive: drive_v3.Drive;

  constructor(serviceAccount: Record<string, unknown>) {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    });
    this.drive = google.drive({ version: 'v3', auth });
  }

  async listChildNames(folderId: string): Promise<string[]> {
    const names: string[] = [];
    let pageToken: string | undefined;
    do {
      const response = await this.drive.files.list({
        q: `'${folderId.replaceAll("'", "\\'")}' in parents and trashed = false`,
        fields: 'nextPageToken,files(name)',
        pageSize: 1_000,
        pageToken,
      });
      names.push(...(response.data.files ?? []).flatMap((file) => typeof file.name === 'string' ? [file.name] : []));
      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
    return names;
  }
}
