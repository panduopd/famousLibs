/**
 * 待执行的单元任务(一个fiber)
 * 若空闲时间比较多  则一次可以渲染多个fiber
 */
let nextUnitOfWork = null

/**
 * Vdom root (wip: work in progress)
 */
let wipRoot = null

/**
 * 记录此次渲染的fiber tree头结点
 * 用于下次渲染的对比
 */
let currentRoot = null

/**
 * 用于记录此次渲染需要删除的fiber
 */
let deletions = null

/**
 * 用于记录各个函数式组件的hooks
 */
let wipFiber = null

/**
 * 当前hook index
 */
let hookIndex = null

function createElement(type, props, ...children) {
    /**
     * 舍弃react其他属性 只保留最重要的type和属性
     */
    return {
        type,
        props: {
            ...props,
            children: children.map(eachChild => 
                typeof eachChild === 'object'
                    ? eachChild
                    : createTextElement(eachChild)    
            )
        }
    }
}
/**
 * 对于text不使用innerHTML 使用createTextNode 使得文字与其他类型节点的操作方式一致, 便于递归
 * @param string text 
 */
function createTextElement(text) {
    return {
        type: 'TEXT_ELEMENT',
        props: {
            nodeValue: text,
            children: []
        }
    }
}

function createDom(fiber) {
    const dom = 
        fiber.type === 'TEXT_ELEMENT' 
            ? document.createTextNode('')
            : document.createElement(fiber.type)
    
    /**
     * 添加props  单独处理events
     */
    updateDom(dom, {}, fiber.props)
    
    return dom
}

const isNew = (prev, next) => key => prev[key] !== next[key]
const isGone = (prev, next) => key => !(key in next)
/**
 * event事件需要进行单独处理 
 */
const isEvent = key => key.startsWith('on')
const isProperty = key => key !== 'children' && !isEvent(key)

/**
 * 此次渲染的fiber type与上次一致时 进行props替换
 */
function updateDom(dom, prevProps, nextProps) {
    //移除旧事件
    Object.keys(prevProps)
        .filter(isEvent)
        .filter(key => !(key in nextProps) || isNew(prevProps, nextProps)(key))
        .forEach(eachProp => {
            const eventType = eachProp.toLowerCase().substring(2)
            dom.removeEventListener(eventType, prevProps[eachProp])
        })

    //移除旧props
    Object.keys(prevProps)
        .filter(isProperty)
        .filter(isGone(prevProps, nextProps))
        .forEach(eachProp => {
            dom[eachProp] = ''
        })
    
    //添加新props
    Object.keys(nextProps)
        .filter(isProperty)
        .filter(isNew(prevProps, nextProps))
        .forEach(eachProp => {
            dom[eachProp] = nextProps[eachProp]
        })

    //添加新事件
    Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach(eachProp => {
        const eventType = eachProp.toLowerCase().substring(2)
        dom.addEventListener(eventType, nextProps[eachProp])
    })
}

/**
 * 所有vdom渲染工作均已完成  提交改动到真实dom
 */
function commitRoot() {

    deletions.forEach(commitWork)

    /**
     * wipRoot的dom为render指定的container
     */
    commitWork(wipRoot.child)

    /**
     * 渲染结束后记录此次渲染的vdom的头结点
     * 用于下次渲染时进行vdom的diff  以最小化需要渲染的节点数
     */
    currentRoot = wipRoot

    /**
     * 等待下次触发render
     */
    wipRoot = null
}

/**
 * 递归渲染fiber到真实dom
 */
function commitWork(fiber) {
    if(!fiber) return

    /**
     * 函数式组件本身没有dom
     * 比如<div id='root'><App/></div>
     * App函数执行完毕后得到的是App的children
     * 这些不能挂在App的dom下  只能向上寻找div#root来挂载
     */
    let domParentFiber = fiber.parent
    while (!domParentFiber.dom) {
        domParentFiber = domParentFiber.parent
    }
    const domParent = domParentFiber.dom

    if (fiber.effectTag === 'PLACEMENT' && fiber.dom !== null) {
        domParent.appendChild(fiber.dom)
    } else if (fiber.effectTag === 'UPDATE' && fiber.dom !== null) {
        updateDom(fiber.dom, fiber.alternate.props, fiber.props)
    } else if (fiber.effectTag === 'DELETION') {
        commitDeletion(fiber, domParent)
    }

    commitWork(fiber.child)
    commitWork(fiber.sibling)
}

function commitDeletion(fiber, domParent) {
    if(fiber.dom) {
        domParent.removeChild(fiber.dom)
    } else {
        /**
         * 函数组件没有dom  只能向下删除其children
         */
        commitDeletion(fiber.child, domParent)
    }
}

/**
 * 模拟fiber
 */
function render(element, container) {
    wipRoot = {
        dom: container,
        props: {
            children: [element]
        },
        alternate: currentRoot
    }
    deletions = []
    nextUnitOfWork = wipRoot
}

function workLoop(deadline) {
    let shouldYield = false
    while(nextUnitOfWork && !shouldYield) {
        /**
         * 沿着fiber tree自顶向下寻找待渲染节点
         * 渲染结果汇总进virtual dom,等待全部渲染完成后,整体渲染进dom
         */
        nextUnitOfWork = performUnitOfWork(nextUnitOfWork)

        /**
         * 当前时间分片结束 停止渲染
         */
        shouldYield = deadline.timeRemaining() < 1
    }

    /**
     * 所有vdom渲染已经执行完毕,则将当前vdom渲染进dom
     */
    if(!nextUnitOfWork && wipRoot) {
        commitRoot()
    }

    /**
     * 等待下一次的空闲时间 进行下一个单元的渲染
     */
    requestIdleCallback(workLoop)
}

/**
 * 开始执行vdom渲染循环
 */
requestIdleCallback(workLoop)

/**
 * 自顶向下逐层渲染
 * fiber: {
 *     type: string,
 *     props: {
 *         children: [createElement创建的element],
 *         ...//其他属性 如id: 'xxx'
 *     },
 *     dom: ElementNode, // 当前节点对应的实际dom节点
 *     child: fiber, // 第一个子节点
 *     sibling: fiber, // 右侧兄弟节点
 *     parent: fiber, // 父级节点
 * }
 */
function performUnitOfWork(fiber) {
    const isFunctionComponent = fiber.type instanceof Function

    if(isFunctionComponent) {
        updateFunctionComponent(fiber)
    } else {
        updateHostComponent(fiber)
    }

    if(fiber.child){
        return fiber.child 
    }
 
    let nextFiber = fiber
    while(nextFiber) {
        /**
         * 若当前节点无子节点 则返回其右侧兄弟节点
         */
        if(nextFiber.sibling) {
            return nextFiber.sibling
        }
 
        /**
         * 若无右侧兄弟节点  则向上返回寻找其父级节点的右侧兄弟节点
         */
        nextFiber = nextFiber.parent
    }
}

/**
 * 更新函数组件
 * 需要执行fiber.type对应的函数 以获取函数组件的children
 */
function updateFunctionComponent(fiber) {

    wipFiber = fiber
    /**
     * 记录当前函数组件的hooks信息
     */
    wipFiber.hooks = []
    /**
     * 初始化当前函数组件的hooks数组index 从0开始记录所有下辖hooks
     */
    hookIndex = 0
    

    /**
     * 执行函数
     * filber.type 是一个function 返回值作为当前fiber的children
     */
    const children = [fiber.type(fiber.props)]
    reconcileChildren(fiber, children)
}

/**
 * 模拟useEffect hook
 * @param Function callback 回调函数
 * @param Array dependencies 依赖数组
 */
function useEffect(callback, dependencies) {
    // 比较变化是由此次渲染与上次渲染的dependencies来对比
    const oldHook = wipFiber.alternate?.hooks && wipFiber.alternate.hooks[hookIndex]

    const hook = {
        /**
         * 记录依赖数组
         */
        dependencies,
        /**
         * 记录副作用清除函数
         */
        clearCallback: null,
    }
    wipFiber.hooks.push(hook)

    /**
     * 对比dependencies是否有变化
     */
    const changed = 
        !oldHook?.dependencies //首次渲染
        || !dependencies //未传入依赖数组
        || dependencies.some((dep,index) => dep !== oldHook.dependencies[index])

    if(changed) {
        /**
         * 所有的副作用清除都是在这一次渲染时来清除上一次渲染的
         */
        if(oldHook?.clearCallback instanceof Function){
            oldHook.clearCallback()
        }

        /**
         * 执行effect方法并记录其返回的副作用清除函数
         */
        hook.clearCallback = callback()
    }

    hookIndex++
}

/**
 * 模拟useState hook
 */
function useState(initial) {
    /**
     * wipFiber指向的是当前执行中的函数式组件(updateFunctionComponent时调用)
     * hookIndex为当前组件中执行的第几个hook
     */
    const oldHook = wipFiber.alternate?.hooks && wipFiber.alternate.hooks[hookIndex]

    const hook = {
        /**
         * 若state有值 则使用此值,若没有 则进行初始化
         */
        state: oldHook ? oldHook.state : initial,
        /**
         * 多个setState调用合并到一个queue里 等待下一次分片调用时可以进行合并处理
         */
        queue: []
    }

    /**
     * 此次渲染是由上次setState触发
     * 所以这里调用上次渲染时 记录的所有setState action操作来更新当前state值
     */
    const actions = oldHook?.queue || []
    actions.forEach(action => {
        hook.state = (action instanceof Function) ? action(hook.state) : action
    })

    const setState = action => {
        /**
         * 合并setState队列
         */
        hook.queue.push(action)

        wipRoot = {
            dom: currentRoot.dom,
            props: currentRoot.props,
            alternate: currentRoot
        }
        /**
         * 触发fiber tree重新渲染
         */
        nextUnitOfWork = wipRoot
        deletions = []
    }

    /**
     * 记录当前函数组件所有hooks
     */
    wipFiber.hooks.push(hook)

    /**
     * 所有hooks按照执行顺序保存在数组中,不可以调整顺序,所以hooks定义不允许出现在条件分支中
     */
    hookIndex++

    /**
     * 本次函数执行返回更新后的state值(非初始化情况下)
     */
    return [hook.state, setState]
}

/**
 * 更新非函数节点
 * 正常创建此节点所对应的dom节点
 */
function updateHostComponent(fiber) {
    if(!fiber.dom){
        fiber.dom = createDom(fiber)
    }

    const elements = fiber.props.children
    reconcileChildren(fiber, elements)
}

/**
 * 处理fiber的child与sibling 同时进行diff
 * @param 待处理的fiber wipFiber 
 * @param 子fiber列表 elements 
 */
function reconcileChildren(wipFiber, elements) {
    let index = 0
    let oldFiber = wipFiber?.alternate?.child
    let prevSibling = null

    /**
     * 创建子节点兄弟链表 以第一个子节点为表头
     */
    while(index < elements.length || oldFiber) {
        const eachChild = elements[index]
        let newFiber = null

        //进行对比 react在这一步也对比了key 若key相同而在elements数组中的index不同  也不会触发重新渲染而只是替换
        const sameType = oldFiber && eachChild && eachChild.type === oldFiber.type

        /**
         * 若上次渲染的节点与此次的节点类型相同 则不必重新渲染。只需替换props即可
         */
        if(sameType) {
            newFiber = {
                type: oldFiber.type,
                props: eachChild.props,
                dom: oldFiber.dom,
                parent: wipFiber,
                alternate: oldFiber,
                effectTag: 'UPDATE'
            }
        }

        /**
         * 若类型不同且存在一个新节点 则需要向vdom添加一个新节点(注意while条件)
         */
        if(eachChild && !sameType) {
            newFiber = {
                type: eachChild.type,
                props: eachChild.props,
                dom: null,
                parent: wipFiber,
                alternate: null,
                effectTag: 'PLACEMENT'
            }
        }

        /**
         * 若类型不同且上次渲染了一个旧节点 则需删除此旧节点
         */
        if(oldFiber && !sameType) {
            oldFiber.effectTag = 'DELETION'
            deletions.push(oldFiber)
        }

        /**
         * 当前子节点结束 进入它的sibling,则oldFiber也要相应的获取sibling
         */
        if(oldFiber) {
            oldFiber = oldFiber.sibling
        }

        if(index === 0){
            wipFiber.child = newFiber
        }else{
            prevSibling.sibling = newFiber
        }
        prevSibling = newFiber
        index ++
    }
}

export {
    createElement,
    render,
    useState,
    useEffect
}