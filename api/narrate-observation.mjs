export default function handler(_request, response) {
  response.statusCode = 503;
  response.end();
}
