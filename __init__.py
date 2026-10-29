"""Agent half of the Home dashboard package.

The HTTP routes live in dashboard/plugin_api.py and mount under /api/plugins/hermes-dashboard/.
The desktop page lives in desktop/plugin.js. Nothing is registered with the agent here.
"""


def register(ctx):
    # Deliberately empty: no tools, hooks or commands on the agent side.
    return None
