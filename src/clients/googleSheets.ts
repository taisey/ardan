import { google, type sheets_v4 } from 'googleapis';

export class GoogleSheetsClient {
  private readonly sheets: sheets_v4.Sheets;

  constructor(
    serviceAccount: Record<string, unknown>,
    private readonly spreadsheetId: string,
  ) {
    const auth = new google.auth.GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    this.sheets = google.sheets({ version: 'v4', auth });
  }

  async readRows(range: string): Promise<string[][]> {
    const response = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.spreadsheetId, range });
    return (response.data.values ?? []).map((row) => row.map((value) => String(value)));
  }

  async appendRow(range: string, values: string[]): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
  }

  async updateRow(range: string, values: string[]): Promise<void> {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range,
      valueInputOption: 'RAW',
      requestBody: { values: [values] },
    });
  }

  async ensureSheet(title: string, header: string[]): Promise<void> {
    const spreadsheet = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    if (spreadsheet.data.sheets?.some((sheet) => sheet.properties?.title === title)) return;
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await this.updateRow(`${title}!A1:${String.fromCharCode(64 + header.length)}1`, header);
  }
}
