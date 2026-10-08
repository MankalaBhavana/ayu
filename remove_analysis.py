import re

path = r'e:\ayu\frontend\src\lib\constants.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove NAV_ITEMS analytics
content = re.sub(r'^\s*\{\s*id:\s*"analytics",.*?\},\n', '', content, flags=re.MULTILINE)

# Remove from MODULE_PERMISSIONS
content = re.sub(r'^\s*analytics:\s*\[.*?\],\n', '', content, flags=re.MULTILINE)

# Remove from PAGE_MODULE_MAP
content = re.sub(r'^\s*analytics:\s*"analytics",\n', '', content, flags=re.MULTILINE)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

app_path = r'e:\ayu\frontend\src\App.tsx'
with open(app_path, 'r', encoding='utf-8') as f:
    app_content = f.read()

# Remove from valid pages array
app_content = re.sub(r'"analytics",\s*', '', app_content)

# Remove import
app_content = re.sub(r'import AnalysisPage.*?\n', '', app_content)

# Remove Route block
route_block = r'\s*\{page === "analytics" && \(\s*<AnalysisPage[\s\S]*?\/>\s*\)\}'
app_content = re.sub(route_block, '', app_content, flags=re.DOTALL)

with open(app_path, 'w', encoding='utf-8') as f:
    f.write(app_content)
