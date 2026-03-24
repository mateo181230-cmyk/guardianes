const supabaseUrl = 'https://eixfmvsbjjxfytjynnkf.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVpeGZtdnNiamp4Znl0anlubmtmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQxNDEzMjksImV4cCI6MjA4OTcxNzMyOX0.ir4g_PI4KKyy14vDfGA4GHDdIIw3Ty2FqS0uC_Z-qQY';

fetch(`${supabaseUrl}/rest/v1/eventos?select=*&limit=1`, {
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`
  }
})
.then(res => res.json())
.then(data => console.log(JSON.stringify(data, null, 2)))
.catch(err => console.error(err));
