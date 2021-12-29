import { useState, useEffect, useMemo } from 'react'
import get from 'lodash/get'
import isString from 'lodash/isString'
import isNumber from 'lodash/isNumber'
import { forceSimulation, forceManyBody, forceCenter, forceLink } from 'd3-force'
import { useTheme } from '@nivo/core'
import { useInheritedColor } from '@nivo/colors'
import { commonDefaultProps } from './defaults'
import {
    InputLink,
    NetworkInputNode,
    NetworkCommonProps,
    NetworkNodeColor,
    NetworkLinkThickness,
    NetworkComputedNode,
    ComputedLink,
} from './types'

const computeForces = <N extends NetworkInputNode>({
    linkDistance,
    repulsivity,
    distanceMin,
    distanceMax,
    center,
}: {
    linkDistance: NetworkCommonProps<N>['linkDistance']
    repulsivity: NetworkCommonProps<N>['repulsivity']
    distanceMin: NetworkCommonProps<N>['distanceMin']
    distanceMax: NetworkCommonProps<N>['distanceMax']
    center: [number, number]
}) => {
    let getLinkDistance
    if (typeof linkDistance === 'function') {
        getLinkDistance = linkDistance
    } else if (isNumber(linkDistance)) {
        getLinkDistance = linkDistance
    } else if (isString(linkDistance)) {
        getLinkDistance = (link: InputLink) => get(link, linkDistance)
    }

    const linkForce = forceLink()
        .id((d: any) => d.id)
        .distance(getLinkDistance as any)

    const chargeForce = forceManyBody()
        .strength(-repulsivity)
        .distanceMin(distanceMin)
        .distanceMax(distanceMax)

    const centerForce = forceCenter(center[0], center[1])

    return { link: linkForce, charge: chargeForce, center: centerForce }
}

const useNodeColor = <N extends NetworkInputNode>(color: NetworkNodeColor<N>) =>
    useMemo(() => {
        if (typeof color === 'function') return color
        return () => color
    }, [color])

const useLinkThickness = <N extends NetworkInputNode>(thickness: NetworkLinkThickness<N>) =>
    useMemo(() => {
        if (typeof thickness === 'function') return thickness
        return () => thickness
    }, [thickness])

export const useNetwork = <N extends NetworkInputNode = NetworkInputNode>({
    center,
    nodes,
    links,
    linkDistance = commonDefaultProps.linkDistance,
    repulsivity = commonDefaultProps.repulsivity,
    distanceMin = commonDefaultProps.distanceMin,
    distanceMax = commonDefaultProps.distanceMax,
    iterations = commonDefaultProps.iterations,
    nodeColor = commonDefaultProps.nodeColor,
    nodeBorderWidth = commonDefaultProps.nodeBorderWidth,
    nodeBorderColor = commonDefaultProps.nodeBorderColor,
    linkThickness = commonDefaultProps.linkThickness,
    linkColor = commonDefaultProps.linkColor,
}: {
    center: [number, number]
    nodes: N[]
    links: InputLink[]
    linkDistance?: NetworkCommonProps<N>['linkDistance']
    repulsivity?: NetworkCommonProps<N>['repulsivity']
    distanceMin?: NetworkCommonProps<N>['distanceMin']
    distanceMax?: NetworkCommonProps<N>['distanceMax']
    iterations?: NetworkCommonProps<N>['iterations']
    nodeColor?: NetworkCommonProps<N>['nodeColor']
    nodeBorderWidth?: NetworkCommonProps<N>['nodeBorderWidth']
    nodeBorderColor?: NetworkCommonProps<N>['nodeBorderColor']
    linkThickness?: NetworkCommonProps<N>['linkThickness']
    linkColor?: NetworkCommonProps<N>['linkColor']
}): [null | NetworkComputedNode<N>[], null | ComputedLink<N>[]] => {
    // we're using `null` instead of empty array so that we can dissociate
    // initial rendering from updates when using transitions.
    const [currentNodes, setCurrentNodes] = useState<null | NetworkComputedNode<N>[]>(null)
    const [currentLinks, setCurrentLinks] = useState<null | ComputedLink<N>[]>(null)

    const centerX = center[0]
    const centerY = center[1]

    useEffect(() => {
        const forces = computeForces<N>({
            linkDistance,
            repulsivity,
            distanceMin,
            distanceMax,
            center: [centerX, centerY],
        })

        const nodesCopy: N[] = nodes.map(node => ({ ...node }))
        const linksCopy: InputLink[] = links.map(link => ({
            id: `${link.source}.${link.target}`,
            ...link,
        }))

        const simulation = forceSimulation(nodesCopy as any[])
            .force('link', forces.link.links(linksCopy))
            .force('charge', forces.charge)
            .force('center', forces.center)
            .stop()

        simulation.tick(iterations)

        // d3 mutates data, hence the castings
        setCurrentNodes(nodesCopy as unknown as NetworkComputedNode<N>[])
        setCurrentLinks(
            (linksCopy as unknown as ComputedLink<N>[]).map(link => {
                link.previousSource = currentNodes
                    ? currentNodes.find(n => n.id === link.source.id)
                    : undefined
                link.previousTarget = currentNodes
                    ? currentNodes.find(n => n.id === link.target.id)
                    : undefined

                return link
            })
        )

        return () => {
            // prevent the simulation from continuing in case the data is updated,
            // would be a waste of resource.
            simulation.stop()
        }
    }, [
        centerX,
        centerY,
        nodes,
        links,
        linkDistance,
        repulsivity,
        distanceMin,
        distanceMax,
        iterations,
    ])

    const theme = useTheme()
    const getNodeColor = useNodeColor<N>(nodeColor)
    const getNodeBorderColor = useInheritedColor(nodeBorderColor, theme)
    const getLinkThickness = useLinkThickness<N>(linkThickness)
    const getLinkColor = useInheritedColor(linkColor, theme)

    const enhancedNodes: NetworkComputedNode<N>[] | null = useMemo(() => {
        if (currentNodes === null) return null

        return currentNodes.map(node => {
            return {
                ...node,
                color: getNodeColor(node),
                borderWidth: nodeBorderWidth,
                borderColor: getNodeBorderColor(node),
            }
        })
    }, [currentNodes, getNodeColor, nodeBorderWidth, getNodeBorderColor])

    const enhancedLinks: ComputedLink<N>[] | null = useMemo(() => {
        if (currentLinks === null) return null

        return currentLinks.map(link => {
            return {
                ...link,
                thickness: getLinkThickness(link),
                color: getLinkColor(link),
            }
        })
    }, [currentLinks, getLinkThickness, getLinkColor])

    return [enhancedNodes, enhancedLinks]
}
