export async function requestJson(
  request: () => Promise<Response>,
  errorMessage: string,
): Promise<unknown> {
  const response = await request()

  if (!response.ok) {
    throw new Error(errorMessage)
  }

  return response.json()
}
