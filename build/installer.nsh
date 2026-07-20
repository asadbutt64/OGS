; Custom NSIS Installer script for OmniGene Studio
; Handles uninstaller prompts for user data deletion

!macro customUnInstall
  MessageBox MB_YESNO|MB_ICONQUESTION "Do you want to delete all stored user datasets and the reference SQLite database?" IDNO skip_delete
  RMDir /r "$APPDATA\OmniGene Studio"
  skip_delete:
!macroend
