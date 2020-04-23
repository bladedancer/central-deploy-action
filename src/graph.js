
// Information for invocation (scope/kind)
// For now version and group are hard coded
function processNaming(resources) {
    return resources.reduce((col, res) => {
        col[res.spec.kind] = {
            scope: res.spec.scope ? res.spec.scope.kind : undefined,
            plural: res.spec.plural
        };
        return col;
    }, {})
}

// Calcuate the order from the dependency graph.
function processOrder(resources) {
    const nodes = resources.reduce((col, res) => {
        col[res.spec.kind] = {
            kind: res.spec.kind,
            scope: res.spec.scope,
            parents: {},
            children: {},
            depth: -1
        };
        return col;
    }, {});

    resources.forEach(res => {
        res.spec.references.toResources.forEach(parent => {
            nodes[res.spec.kind].parents[parent.kind] = nodes[parent.kind];
        });
        res.spec.references.fromResources.forEach(child => {
            nodes[res.spec.kind].children[child.kind] = nodes[child.kind];
        });
    });

    // Simple ordering for now.
    const assignPos = (node) => {
        // Already done.
        if (node.depth !== -1) {
            return node.depth;
        }
        // This is to avoid scopes and parentless ambiguity.
        // Unscoped && no parents start at 0
        // scoped && no parents start at 1
        // everyone else start at -1 (calc depth)
        if (node.scope) {
            node.depth = Object.keys(node.parents).length === 0 ? 1 : -1;
        } else {
            node.depth = 0;
        }

        if (node.depth == -1) {
            node.depth = Object.values(node.parents).reduce((pos, parent) => {
                const parPos = assignPos(parent);
                return (parPos >= pos) ? parPos + 1 : pos;
            }, node.depth);
        }
        
        // Special logic for deployment as we want it at the bottom of the list to
        // ensure that everything else is completed before the deployment event fires.
        if (node.kind === 'Deployment') {
            node.depth = 10000;
        }
        return node.depth;
    };

    Object.values(nodes).forEach(assignPos);
    const order = Object.values(nodes)
        .sort((l,r) => l.depth - r.depth)
        .map(n => n.kind);
    return order;
}

// Organize the resources.
function process(resources) {
    const naming = processNaming(resources);
    const order = processOrder(resources);
    return {
        naming,
        order
    }
}

module.exports = {
    process
};
  