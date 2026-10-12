import ftplib
import sys
from datetime import datetime

def check_ftp_directory():
    # ====================== CONFIGURATION ======================
    HOST = '52.66.20.127'
    PORT = 21
    USERNAME = 'aiaauditprd'
    PASSWORD = 'IU3[)Yu68G6Y'
    REMOTE_DIR = '/home/vendx_prd/prd/po'
    # ===========================================================

    print(f"Connecting to FTP server: {HOST}:{PORT}")
    print("-" * 60)

    ftp = None
    try:
        # Create FTP connection with timeout
        ftp = ftplib.FTP()
        ftp.connect(HOST, PORT, timeout=15)
        print(f"✅ Connected successfully to {HOST}")

        # Login
        ftp.login(USERNAME, PASSWORD)
        print(f"✅ Logged in as: {USERNAME}")

        # Set passive mode (important for most modern FTP servers)
        ftp.set_pasv(True)

        # Change to target directory
        ftp.cwd(REMOTE_DIR)
        print(f"✅ Changed to directory: {REMOTE_DIR}")
        print("-" * 60)

        # List directory contents using MLSD (structured output)
        print(f"📁 Contents of {REMOTE_DIR}:\n")

        file_count = 0
        dir_count = 0

        try:
            # Modern way - gives file type, size, modification time
            for name, facts in ftp.mlsd():
                facts_type = facts.get('type', 'unknown')
                size = facts.get('size', 'N/A')
                modify = facts.get('modify', '')

                # Format modification time
                if modify:
                    try:
                        dt = datetime.strptime(modify, "%Y%m%d%H%M%S")
                        modify_str = dt.strftime("%Y-%m-%d %H:%M:%S")
                    except:
                        modify_str = modify
                else:
                    modify_str = "N/A"

                if facts_type == 'dir':
                    print(f"📁 {name:<50} | DIR     | {modify_str}")
                    dir_count += 1
                else:
                    print(f"📄 {name:<50} | {size:>10} bytes | {modify_str}")
                    file_count += 1

        except ftplib.error_perm:
            # Fallback if MLSD is not supported
            print("MLSD not supported. Using simple listing...\n")
            files = ftp.nlst()
            for name in files:
                print(f"   {name}")
            file_count = len(files)

        print("-" * 60)
        print(f"✅ Total: {file_count} files | {dir_count} folders")
        print(f"✅ Directory check completed successfully!")

    except ftplib.error_perm as e:
        print(f"❌ Permission/Login Error: {e}")
        print("   → Check username, password, or directory permissions.")
    except ConnectionRefusedError:
        print("❌ Connection Refused!")
        print("   → Port 21 is likely closed or firewalled.")
    except ftplib.error_temp as e:
        print(f"❌ Temporary FTP Error: {e}")
    except Exception as e:
        print(f"❌ Unexpected Error: {e}")
    finally:
        if ftp:
            try:
                ftp.quit()
            except:
                pass


if __name__ == "__main__":
    check_ftp_directory()