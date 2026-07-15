"""统一退出码。"""

EXIT_OK = 0
EXIT_ERROR = 1
EXIT_USAGE = 2  # 参数错误 / 未知 type / 缺必填


class UsageError(Exception):
    """用户输入或契约校验失败。"""


class EngineError(Exception):
    """引擎执行失败。"""
