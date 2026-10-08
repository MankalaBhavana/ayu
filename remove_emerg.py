import re

path = r'e:\ayu\frontend\src\lib\constants.ts'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Remove NAV_ITEMS emergency worklist
content = re.sub(r'\{ id: "emergency-worklist".*?\},\n\s*', '', content)

# Remove emergency from MODULE_PERMISSIONS
content = re.sub(r'\s*emergency: \["patients.read", "patients.write"\],', '', content)

# Remove from PAGE_MODULE_MAP
content = re.sub(r'\s*"emergency-worklist": "emergency",', '', content)
content = re.sub(r'\s*emergency: "emergency",', '', content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
