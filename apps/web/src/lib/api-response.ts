export async function requestJson<T>(
  request: () => Promise<Response>,
  errorMessage: string,
): Promise<T> {
  const response = await request()

  if (!response.ok) {
    throw new Error(errorMessage)
  }

  return (await response.json()) as T
}
