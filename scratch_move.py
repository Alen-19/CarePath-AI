import sys

file_path = r'd:\AlenKuriakose\CarePathAI\frontend\src\app\features\doctor\doctor-dashboard.component.html'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

start_marker = '<!-- ══════════════ PAST CONSULTATION RECORD MODAL ══════════════ -->'

idx_start = content.find(start_marker)
if idx_start == -1:
    print('Start marker not found')
    sys.exit(1)

idx_last_div = content.rfind('</div>')

if idx_last_div == -1:
    print('Last div not found')
    sys.exit(1)

modals_text = content[idx_start:idx_last_div]

new_content = content[:idx_start] + '\n</div>\n\n' + modals_text

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print('Successfully moved modals outside the profile tab block!')
