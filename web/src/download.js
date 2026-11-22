// POST to an export endpoint and save the file it returns. Resolves to the saved file name.
export async function downloadPost(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Download failed')
  const name = res.headers.get('Content-Disposition')?.match(/filename="([^"]+)"/)?.[1] || 'download'
  const href = URL.createObjectURL(await res.blob())
  Object.assign(document.createElement('a'), { href, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(href), 2000)
  return name
}

export const FORMATS = [['xlsx', 'Excel'], ['docx', 'Word'], ['pdf', 'PDF']]
