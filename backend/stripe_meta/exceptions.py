class QuotaError(Exception):
    def __init__(self, code, message='', **payload):
        self.code = code
        self.message = message
        self.payload = payload
        super().__init__(message)
