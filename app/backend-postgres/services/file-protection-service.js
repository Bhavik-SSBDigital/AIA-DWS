import ExcelJS from "exceljs";
import AdmZip from "adm-zip";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export class FileProtectionService {
  /**
   * EXCEL: Locks all cells and protects sheet structure with a password.
   */
  static async protectExcelFile(originalPath, password = "PROTECTED_USER_123") {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(originalPath);

    workbook.eachSheet((worksheet) => {
      // Lock every cell
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.protection = { locked: true, hidden: false };
        });
      });

      // Enable Sheet Protection
      worksheet.protect(password, {
        selectLockedCells: true,
        selectUnlockedCells: false,
        formatCells: false,
        formatColumns: false,
        formatRows: false,
        insertColumns: false,
        insertRows: false,
        deleteColumns: false,
        deleteRows: false,
        sheet: true,
      });
    });

    // Lock Workbook Structure
    workbook.workbookProtection = {
      lockStructure: true,
      workbookPassword: password,
    };

    const protectedPath = originalPath.replace(
      path.extname(originalPath),
      `.protected${path.extname(originalPath)}`,
    );
    await workbook.xlsx.writeFile(protectedPath);
    return protectedPath;
  }

  /**
   * WORD: Injects XML enforcement tags to trigger "Read Only" / "Filling in Forms" restriction.
   */
  static async protectWordFile(originalPath) {
    const zip = new AdmZip(originalPath);
    const protectedPath = originalPath.replace(".docx", ".protected.docx");

    // Modify settings.xml to enforce 'ReadOnly'
    const settingsEntry = zip.getEntry("word/settings.xml");
    if (settingsEntry) {
      let xml = zip.readAsText(settingsEntry);

      // Clear existing protection
      xml = xml.replace(/<w:documentProtection[^>]*\/>/g, "");

      // Enforce ReadOnly (edit="readOnly", enforcement="1")
      const protectionTag = `<w:documentProtection w:edit="readOnly" w:enforcement="1" w:cryptProviderType="rsaAES" w:cryptAlgorithmClass="hash" w:cryptAlgorithmType="typeAny" w:cryptAlgorithmSid="14" />`;

      if (xml.includes("</w:settings>")) {
        xml = xml.replace("</w:settings>", `${protectionTag}</w:settings>`);
      }
      zip.updateFile("word/settings.xml", Buffer.from(xml));
    }

    // Force DocSecurity to 4 (Read-Only Recommended)
    const appEntry = zip.getEntry("docProps/app.xml");
    if (appEntry) {
      let xml = zip.readAsText(appEntry);
      xml = xml.replace(
        /<DocSecurity>\d+<\/DocSecurity>/,
        "<DocSecurity>4</DocSecurity>",
      );
      zip.updateFile("docProps/app.xml", Buffer.from(xml));
    }

    zip.writeZip(protectedPath);
    return protectedPath;
  }

  /**
   * Unified Entry Point
   */
  static async applyStandardProtection(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".xlsx") return await this.protectExcelFile(filePath);
    if (ext === ".docx") return await this.protectWordFile(filePath);
    return filePath; // Return original if not Office file
  }

  static async cleanupTempFile(tempPath) {
    try {
      if (tempPath && tempPath.includes(".protected.")) {
        await fs.unlink(tempPath);
        console.log("Cleaned up:", tempPath);
      }
    } catch (e) {
      // File might already be gone
    }
  }
}
